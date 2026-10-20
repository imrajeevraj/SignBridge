import { GoogleMeetAdapter } from './google-meet-adapter';
import {
  getAllAdapters,
  getMeetingAdapter,
  type MeetingPlatformAdapter,
  type MeetingPlatformId,
  registerMeetingAdapter,
} from './meeting-provider';
import { TeamsAdapter } from './teams-adapter';
import { ZoomAdapter } from './zoom-adapter';

// Auto-register default adapters
const googleMeet = new GoogleMeetAdapter();
const teams = new TeamsAdapter();
const zoom = new ZoomAdapter();

registerMeetingAdapter(googleMeet);
registerMeetingAdapter(teams);
registerMeetingAdapter(zoom);

export {
  GoogleMeetAdapter,
  TeamsAdapter,
  ZoomAdapter,
  getAllAdapters,
  getMeetingAdapter,
  registerMeetingAdapter,
};

export type {
  MeetingPlatformAdapter,
  MeetingPlatformId,
};

