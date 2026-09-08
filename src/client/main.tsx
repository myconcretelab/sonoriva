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

applyAppSkin(readAppSkin());

const RootApp = window.location.pathname === '/reset-password'
  ? PasswordResetScreen
  : window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
    ? AdminApp
    : App;
createRoot(document.getElementById('root')!).render(<StrictMode><RootApp /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => registerAppServiceWorker(__APP_VERSION__).catch(() => undefined));
}
