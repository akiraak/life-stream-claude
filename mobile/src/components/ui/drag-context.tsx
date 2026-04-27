import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';

// タップハンドラから同期的に読みたいので state ではなく ref を共有する。
// Provider 外のコンポーネントは no-op の既定値を受け取る。
interface DragContextValue {
  ref: MutableRefObject<boolean>;
  setDragging: (value: boolean) => void;
}

const DEFAULT_VALUE: DragContextValue = {
  ref: { current: false },
  setDragging: () => {},
};

const DragContext = createContext<DragContextValue>(DEFAULT_VALUE);

export function DragProvider({ children }: { children: ReactNode }) {
  const ref = useRef(false);
  const value = useMemo<DragContextValue>(
    () => ({
      ref,
      setDragging: (v: boolean) => {
        ref.current = v;
      },
    }),
    [],
  );
  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

export function useDragState(): DragContextValue {
  return useContext(DragContext);
}
