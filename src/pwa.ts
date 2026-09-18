export function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("./sw.js", window.location.href);

    navigator.serviceWorker.register(serviceWorkerUrl, { scope: "./" }).catch((error) => {
      console.error("Falha ao registrar o Service Worker do ITAM | Materiais:", error);
    });
  });
}
