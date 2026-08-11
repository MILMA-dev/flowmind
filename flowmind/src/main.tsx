/**
 * FlowMind — Point d'entrée MILMA
 * Instanciation & Bootstrap du système Personal OS
 *
 * Services enregistrés dans App au bootstrap :
 * CaptureService, ConversionService, WorkflowEngine,
 * SubtaskManager, RecurrenceEngine, NodeInspectorController,
 * ExecutionEngine, TriggerService, CalendarManager
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
