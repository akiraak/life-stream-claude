import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useThemeColors } from '../../theme/theme-provider';
import { useAuthStore } from '../../stores/auth-store';
import { runLoginMigration } from '../../utils/migration';

type Step = 'email' | 'code';

export function AuthModal() {
  const colors = useThemeColors();
  const visible = useAuthStore((s) => s.authModalVisible);
  const reason = useAuthStore((s) => s.authModalReason);
  const closeAuthModal = useAuthStore((s) => s.closeAuthModal);
  const sendMagicCode = useAuthStore((s) => s.sendMagicCode);
  const verify = useAuthStore((s) => s.verify);
  const finishLogin = useAuthStore((s) => s.finishLogin);
  const cancelLogin = useAuthStore((s) => s.cancelLogin);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (visible) {
      setStep('email');
      setEmail('');
      setCode('');
      setLoading(false);
      setResendCooldown(0);
    }
  }, [visible]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleSendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await sendMagicCode(trimmed);
      setStep('code');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'エラーが発生しました';
      Alert.alert('エラー', message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const trimmedCode = code.trim();
    const trimmedEmail = email.trim();
    if (!trimmedCode || !trimmedEmail) return;
    setLoading(true);
    // 1. verify(): token を保存するだけ。isAuthenticated は立てず mode も local のまま。
    // 2. runLoginMigration(): local モードのまま items/dishes/savedRecipes を読み、
    //    ユーザーに 移す/破棄/キャンセル を問う。mode 切替は行わない。
    // 3. cancelLogin / finishLogin: 認証フラグ反転と server モード切替の正規ルート。
    try {
      await verify(trimmedEmail, trimmedCode);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '認証に失敗しました';
      Alert.alert('エラー', message);
      setLoading(false);
      return;
    }
    try {
      const result = await runLoginMigration();
      if (result === 'cancelled') {
        await cancelLogin();
      } else {
        await finishLogin();
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'マイグレーションに失敗しました';
      Alert.alert('エラー', message);
      await cancelLogin();
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    closeAuthModal();
  };

  const handleResendCode = async () => {
    if (loading || resendCooldown > 0) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    try {
      await sendMagicCode(trimmed);
      setCode('');
      setResendCooldown(30);
      Alert.alert('送信しました', '新しいコードをメールで送信しました');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'エラーが発生しました';
      Alert.alert('エラー', message);
    }
  };

  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>お料理バスケット</Text>
            {reason && <Text style={styles.reason}>{reason}</Text>}

            {step === 'email' ? (
              <>
                <Text style={styles.subtitle}>メールアドレスでログイン</Text>
                <TextInput
                  style={styles.input}
                  placeholder="メールアドレス"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  autoComplete="email"
                  returnKeyType="send"
                  editable={!loading}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, (loading || !email.trim()) && styles.btnDisabled]}
                  onPress={handleSendCode}
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>ログインコードを送信</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkBtn} onPress={handleCancel} disabled={loading}>
                  <Text style={styles.linkText}>キャンセル</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>{email} に送信されたコードを入力</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="認証コード"
                  placeholderTextColor={colors.textMuted}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  returnKeyType="done"
                  autoFocus
                  editable={!loading}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, (loading || !code.trim()) && styles.btnDisabled]}
                  onPress={handleVerify}
                  disabled={loading || !code.trim()}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>ログイン</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={handleResendCode}
                  disabled={loading || resendCooldown > 0}
                >
                  <Text style={[styles.linkText, (loading || resendCooldown > 0) && styles.linkTextDisabled]}>
                    {resendCooldown > 0 ? `再送（残り ${resendCooldown} 秒）` : 'ログインコードの再送'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkBtn} onPress={handleCancel} disabled={loading}>
                  <Text style={styles.linkText}>キャンセル</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.primaryLight,
      textAlign: 'center',
      marginBottom: 4,
    },
    reason: {
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 20,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: colors.text,
      marginBottom: 12,
    },
    codeInput: {
      fontSize: 22,
      textAlign: 'center',
      letterSpacing: 6,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    linkBtn: {
      marginTop: 12,
      alignItems: 'center',
    },
    linkText: {
      color: colors.primaryLight,
      fontSize: 14,
    },
    linkTextDisabled: {
      opacity: 0.5,
    },
  });
}
