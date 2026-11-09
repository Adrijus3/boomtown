import React from 'react';
import { createRoot } from 'react-dom/client';
import UnOfficial from './UnOfficial.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UnOfficial homeHref="/" homeLabel="Back to College Portal" />
  </React.StrictMode>,
);
