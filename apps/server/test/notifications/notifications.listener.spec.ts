import { Logger } from '@nestjs/common';
import { NotificationsListener } from '@/notifications/events/notifications.listener';
import { UserCreatedEvent } from '@/users/events/user-created.event';

describe('NotificationsListener', () => {
  let listener: NotificationsListener;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    listener = new NotificationsListener();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs a welcome notification on UserCreatedEvent', () => {
    const event = new UserCreatedEvent('user-1', 'test@example.com');

    listener.handleUserCreated(event);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('test@example.com'),
    );
  });
});
