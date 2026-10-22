/**
 * Notifications live in the engine (`notificationsBetween`, and
 * `notificationHistory` for the full history back to day 1, M3.3); the
 * server re-exports them under their old names.
 */
export {
  notificationsBetween as notificationsFor,
  type SystemNotification as Notification,
} from '@the-system/engine';
