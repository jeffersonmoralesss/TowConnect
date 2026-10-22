// The background location task MUST be defined here, at the very top of the app, before anything renders.
// When Android wakes the app in the background to deliver a location, it runs this file but never shows
// a screen. If the task were defined inside a component, it wouldn't exist yet and the location would be lost.
import './src/location/task';

import { registerRootComponent } from 'expo';
import App from './App';

// Tells React Native which component is the app. Works the same in Expo Go and in a development build.
registerRootComponent(App);
