import { Module } from '@nestjs/common';
import { NotificationsListener } from '@/notifications/events/notifications.listener';

@Module({
  providers: [NotificationsListener],
})
export class NotificationsModule {}
