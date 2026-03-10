import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { mappingManagementRoles } from '../auth/user-role.utils';
import { PublishedModelService } from './published-model.service';

@Controller('published')
@UseGuards(AuthenticatedUserGuard, RolesGuard)
@Roles(...mappingManagementRoles)
export class PublishedModelController {
  constructor(private readonly publishedModelService: PublishedModelService) {}

  @Get('capabilities')
  async listCapabilities() {
    return this.publishedModelService.listCapabilities();
  }

  @Get('capabilities/:id/subtree')
  async getCapabilitySubtree(@Param('id', ParseUUIDPipe) capabilityId: string) {
    return this.publishedModelService.getCapabilitySubtree(capabilityId);
  }

  @Get('releases')
  async listReleases() {
    return this.publishedModelService.listReleases();
  }

  @Get('releases/:id/diff')
  async getReleaseDiff(@Param('id', ParseUUIDPipe) releaseId: string) {
    return this.publishedModelService.getReleaseDiff(releaseId);
  }
}
