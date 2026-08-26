"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Estado de carregamento compartilhado pela tela inteira.
 *
 * Existe por causa da troca de loja: quem dispara é o seletor, na barra
 * lateral, e quem precisa mostrar o esqueleto é o conteúdo, do outro lado da
 * árvore. Sem um ponto comum, o clique parecia não ter efeito até a página
 * inteira ser recarregada na mão.
 *
 * `useTransition` em volta do `router.refresh()` é o que dá o fim do
 * carregamento de graça: o pendente só cai quando os dados novos do servidor
 * chegaram e foram renderizados.
 */
type AppLoadingValue = {
  loading: boolean;
  /** Recarrega os dados do servidor mantendo o estado de carregamento ligado. */
  reload: () => void;
  setLoading: (value: boolean) => void;
};

const AppLoadingContext = createContext<AppLoadingValue>({
  loading: false,
  reload: () => undefined,
  setLoading: () => undefined,
});

export function AppLoadingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [manual, setManual] = useState(false);

  const reload = useCallback(() => {
    setManual(false);
    startTransition(() => router.refresh());
  }, [router]);

  const value = useMemo(
    () => ({ loading: refreshing || manual, reload, setLoading: setManual }),
    [refreshing, manual, reload],
  );

  return <AppLoadingContext.Provider value={value}>{children}</AppLoadingContext.Provider>;
}

export function useAppLoading() {
  return useContext(AppLoadingContext);
}

/**
 * Troca o conteúdo pelo esqueleto enquanto os dados do servidor não chegam.
 *
 * `children` continua sendo renderizado no servidor: este componente só decide
 * qual dos dois aparece. E, ao desmontar o conteúdo durante a troca, garante
 * que componentes de cliente que guardam a lista em `useState` recomecem com os
 * dados da loja nova em vez de repetir os da anterior.
 */
export function LoadingSwap({ skeleton, children }: { skeleton: ReactNode; children: ReactNode }) {
  const { loading } = useAppLoading();

  return loading ? <>{skeleton}</> : <>{children}</>;
}
