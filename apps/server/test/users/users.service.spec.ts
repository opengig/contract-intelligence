import { UsersService } from '@/users/users.service';
import { UsersRepository } from '@/users/repository/users.repository';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { UpdateUserDto } from '@/users/dto/update-user.dto';
import { UserCreatedEvent } from '@/users/events/user-created.event';
import { EventEmitter2 } from '@nestjs/event-emitter';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepository: jest.Mocked<UsersRepository> = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
} as unknown as jest.Mocked<UsersRepository>;

const mockEventEmitter = {
  emit: jest.fn(),
} as unknown as jest.Mocked<EventEmitter2>;

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(mockRepository, mockEventEmitter);
  });

  describe('findAll', () => {
    it('delegates to repository.findAll', async () => {
      mockRepository.findAll.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockUser]);
    });
  });

  describe('findOne', () => {
    it('delegates to repository.findOne with the given id', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne('user-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUser);
    });

    it('propagates errors from repository', async () => {
      mockRepository.findOne.mockRejectedValue(new Error('Not found'));

      await expect(service.findOne('bad-id')).rejects.toThrow('Not found');
    });
  });

  describe('create', () => {
    const dto: CreateUserDto = { email: 'new@example.com' };
    const createdUser = {
      id: 'user-2',
      email: 'new@example.com',
      name: null,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('delegates to repository.create with the given DTO', async () => {
      mockRepository.create.mockResolvedValue(createdUser);

      const result = await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(dto);
      expect(result.email).toBe('new@example.com');
    });

    it('emits a UserCreatedEvent after creation', async () => {
      mockRepository.create.mockResolvedValue(createdUser);

      await service.create(dto);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.created',
        expect.any(UserCreatedEvent),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.created',
        expect.objectContaining({ userId: 'user-2', email: 'new@example.com' }),
      );
    });
  });

  describe('update', () => {
    it('delegates to repository.update with id and DTO', async () => {
      const dto: UpdateUserDto = { name: 'Updated' };
      mockRepository.update.mockResolvedValue({ ...mockUser, name: 'Updated' });

      const result = await service.update('user-1', dto);

      expect(mockRepository.update).toHaveBeenCalledWith('user-1', dto);
      expect(result.name).toBe('Updated');
    });
  });
});
