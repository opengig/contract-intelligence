import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from '@/users/users.service';
import { CaslGuard } from '@/casl/casl.guard';
import { CheckAbility } from '@/casl/check-ability.decorator';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { UpdateUserDto } from '@/users/dto/update-user.dto';

@Controller('users')
@UseGuards(CaslGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @CheckAbility('read', 'User')
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @CheckAbility('read', 'User')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @CheckAbility('create', 'User')
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @CheckAbility('update', 'User')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
