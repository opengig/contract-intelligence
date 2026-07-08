import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '@/users/events/user-created.event';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  @OnEvent('user.created')
  handleUserCreated(event: UserCreatedEvent) {
    this.logger.log(`Welcome notification queued for ${event.email}`);
  }
}
