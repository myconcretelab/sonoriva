import { initializeDesktop, desktopHost } from './lib/desktop';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AdminApp } from './admin/AdminApp';
import { PasswordResetScreen } from './components/PasswordResetScreen';
import './styles.css';
import './themes.css';
import './admin/admin.css';
import { registerAppServiceWorker } from './lib/app-update';
import { applyAppSkin, readAppSkin } from './lib/app-skin';

async function start() {
  await initializeDesktop();
  applyAppSkin(readAppSkin());

  const RootApp = window.location.pathname === '/reset-password'
    ? PasswordResetScreen
    : window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
      ? AdminApp
      : App;
  createRoot(document.getElementById('root')!).render(<StrictMode><RootApp /></StrictMode>);

  if (desktopHost()) void registerAppServiceWorker(__APP_VERSION__);
  if (!desktopHost() && 'serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => registerAppServiceWorker(__APP_VERSION__).catch(() => undefined));
  }

}
void start().catch((cause) => {
  const root = document.getElementById('root')!;
  const message = document.createElement('p');
  message.className = 'auth-error';
  message.textContent = cause instanceof Error ? cause.message : 'Ouverture de la régie locale impossible.';
  const retry = document.createElement('button');
  retry.textContent = 'Réessayer';
  retry.addEventListener('click', () => window.location.reload());
  root.replaceChildren(message, retry);
});
