import { UsersRepository } from '@/users/repository/users.repository';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { UpdateUserDto } from '@/users/dto/update-user.dto';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  createdAt: new Date(),
};

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersRepository', () => {
  let repository: UsersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UsersRepository(mockPrisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('returns users ordered by createdAt desc with select fields', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await repository.findAll();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockUser]);
    });
  });

  describe('findOne', () => {
    it('returns a user by id', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      const result = await repository.findOne('user-1');

      expect(mockPrisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('throws when user is not found', async () => {
      mockPrisma.user.findUniqueOrThrow.mockRejectedValue(
        new Error('Not found'),
      );

      await expect(repository.findOne('non-existent')).rejects.toThrow(
        'Not found',
      );
    });
  });

  describe('create', () => {
    it('creates a user with the provided DTO', async () => {
      const dto: CreateUserDto = { email: 'new@example.com', name: 'New User' };
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-2',
        ...dto,
        role: 'user',
        createdAt: new Date(),
      });

      const result = await repository.create(dto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({ data: dto });
      expect(result.email).toBe('new@example.com');
    });
  });

  describe('update', () => {
    it('updates a user with the provided DTO', async () => {
      const dto: UpdateUserDto = { name: 'Updated Name' };
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Updated Name',
      });

      const result = await repository.update('user-1', dto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: dto,
      });
      expect(result.name).toBe('Updated Name');
    });

    it('throws when updating a non-existent user', async () => {
      mockPrisma.user.update.mockRejectedValue(new Error('Record not found'));

      await expect(repository.update('bad-id', { name: 'X' })).rejects.toThrow(
        'Record not found',
      );
    });
  });
});
