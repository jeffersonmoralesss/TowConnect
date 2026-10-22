// The background location task. index.js imports this file first, so the task is defined
// before anything else runs (Expo requires it to be defined at the top level of the app).
//
// While the operator is Available, the phone's location service calls this function with new
// locations even when another app is in front or the screen is off (FR-O5).
import * as TaskManager from 'expo-task-manager';
import { reportPosition } from './report';

export const LOCATION_TASK = 'tow-connect-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return; // for example, the operator turned off location in system settings
  const locations = data?.locations ?? [];
  // The phone may deliver several fixes at once. Only the newest matters.
  const newest = locations[locations.length - 1];
  if (newest) await reportPosition(newest);
});
