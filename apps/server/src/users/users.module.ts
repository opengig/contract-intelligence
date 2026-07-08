import { Module } from '@nestjs/common';
import { UsersController } from '@/users/controllers/users.controller';
import { UsersService } from '@/users/users.service';
import { UsersRepository } from '@/users/repository/users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository],
})
export class UsersModule {}
