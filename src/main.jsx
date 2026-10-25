import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { store } from './lib/store.js';
import App from './App.jsx';
import './styles.css';

store.load();
createRoot(document.getElementById('app')).render(<StrictMode><App /></StrictMode>);
