// Starting and stopping location sharing (FR-O4, FR-O5).
//
// Two modes:
//   'background': the phone keeps sending location while other apps are open or the screen is off.
//                 Android shows a permanent notification while it runs, as the system requires.
//                 Needs a development build or a store build, plus "Allow all the time" permission.
//   'foreground': location is sent only while Tow Connect is on screen. Used in Expo Go (which can't
//                 run background tasks) or when the operator only allows "While using the app".
//                 Expo's docs say apps must always be ready to work with only foreground permission.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { forgetOperator, rememberOperator, reportPosition } from './report';
import { HEARTBEAT_MS } from './throttle';
import { LOCATION_TASK } from './task';

// True when running inside the Expo Go app from the app store.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Shared settings for both modes.
//  - Balanced accuracy (about 100 m) instead of High: drivers only ever see the position rounded to
//    about half a mile, so GPS-level precision would cost battery and buy nothing.
//  - timeInterval: at most one fix a minute on Android.
//  - distanceInterval 0: keep getting fixes even when parked, so the minute check-in keeps happening.
const WATCH_OPTIONS = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: HEARTBEAT_MS,
  distanceInterval: 0,
};

let foregroundSubscription = null; // the foreground watcher, when that mode is running
let heartbeatTimer = null;

export class SharingError extends Error {}

// Asks for permission, sends a first position, and starts sharing. Returns the mode that started.
export async function startSharing(operatorId) {
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new SharingError('Location is turned off on this phone. Turn it on in Settings, then try again.');
  }

  // Foreground permission must be granted before asking for background permission.
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    throw new SharingError('Tow Connect needs your location to show drivers where you are. Allow location in Settings.');
  }

  rememberOperator(operatorId);

  // Send one position right away so the truck appears on the map without waiting a minute.
  const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await reportPosition(first, { force: true });

  if (!isExpoGo) {
    // On Android 11 and newer this opens the system settings page, where the operator has to pick
    // "Allow all the time". If they don't, we fall back to foreground mode below.
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status === 'granted') {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        ...WATCH_OPTIONS,
        activityType: Location.ActivityType.AutomotiveNavigation, // iOS: tuned for driving
        pausesUpdatesAutomatically: false, // iOS: don't pause while parked; parked is when we're waiting for calls
        showsBackgroundLocationIndicator: true, // iOS: be honest that location is in use
        foregroundService: {
          // Android: the notification that keeps the service alive and tells the operator they're live
          notificationTitle: 'You are Available on Tow Connect',
          notificationBody: 'Nearby drivers can see your approximate area. Open the app to go offline.',
          notificationColor: '#F5A300',
          killServiceOnDestroy: false, // keep sharing if the app is swiped away; the notification stays as a reminder
        },
      });
      return 'background';
    }
  }

  await startForeground();
  return 'foreground';
}

async function startForeground() {
  stopForeground();
  foregroundSubscription = await Location.watchPositionAsync(WATCH_OPTIONS, (loc) => {
    reportPosition(loc);
  });
  // iPhones don't support timeInterval and may go quiet while parked, so every minute we also
  // resend the last known position. JavaScript timers only run while the app is open, which is
  // exactly when foreground mode works anyway.
  heartbeatTimer = setInterval(async () => {
    const last = await Location.getLastKnownPositionAsync();
    if (last) reportPosition({ ...last, timestamp: Date.now() });
  }, HEARTBEAT_MS);
}

function stopForeground() {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

export async function stopSharing() {
  forgetOperator(); // any location still on its way is now ignored by reportPosition
  stopForeground();
  if (!isExpoGo && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

// Which mode is running right now, or null. Used when the app reopens to find out whether sharing
// survived (for example after the phone restarted, it won't have).
export async function currentMode() {
  if (!isExpoGo && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    return 'background';
  }
  return foregroundSubscription ? 'foreground' : null;
}
