import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Webcam } from './pages/Webcam';
import './styles/globals.css';
const root = document.getElementById('root');
if (!root) throw new Error('Webcam studio root is missing.');
createRoot(root).render(<StrictMode><Webcam /></StrictMode>);
