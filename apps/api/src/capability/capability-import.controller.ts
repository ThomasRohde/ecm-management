import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { capabilityManagementRoles } from '../auth/user-role.utils';
import { CapabilityImportService } from './capability-import.service';
import { ImportCapabilitiesDto } from './dto/import-capabilities.dto';

@Controller('capability-imports')
@UseGuards(AuthenticatedUserGuard, RolesGuard)
@Roles(...capabilityManagementRoles)
export class CapabilityImportController {
  constructor(private readonly capabilityImportService: CapabilityImportService) {}

  @Post('dry-run')
  @HttpCode(HttpStatus.OK)
  async dryRun(@Body() dto: ImportCapabilitiesDto) {
    return this.capabilityImportService.dryRun(dto);
  }

  @Post('commit')
  @HttpCode(HttpStatus.CREATED)
  async commit(@Body() dto: ImportCapabilitiesDto, @CurrentUser() user: AuthTokenPayload) {
    return this.capabilityImportService.commit(dto, user.sub);
  }
}
