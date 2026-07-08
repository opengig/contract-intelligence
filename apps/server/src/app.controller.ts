import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { CaslGuard } from './casl/casl.guard';
import { CheckAbility } from './casl/check-ability.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('admin')
  @UseGuards(CaslGuard)
  @CheckAbility('manage', 'all')
  getAdminDashboard(): { message: string } {
    return { message: 'Welcome, admin!' };
  }
}
