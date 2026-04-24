import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const allowLocalHttp = profile === 'development' || profile === 'preview';

  const base = config as ExpoConfig;
  if (!allowLocalHttp) return base;

  return {
    ...base,
    ios: {
      ...base.ios,
      infoPlist: {
        ...base.ios?.infoPlist,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    plugins: [
      ...(base.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: { usesCleartextTraffic: true },
        },
      ],
    ],
  };
};
