import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  capabilityEditRoles,
  capabilityManagementRoles,
} from '../auth/user-role.utils';
import { CapabilityService, type CapabilitySearchParams } from './capability.service';
import { CreateCapabilityDto } from './dto/create-capability.dto';
import { UpdateCapabilityDto } from './dto/update-capability.dto';
import { CapabilityVersionService } from '../versioning/capability-version.service';

@Controller('capabilities')
export class CapabilityController {
  constructor(
    private readonly capabilityService: CapabilityService,
    private readonly capabilityVersionService: CapabilityVersionService,
  ) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('domain') domain?: string,
    @Query('lifecycleStatus') lifecycleStatus?: string,
    @Query('type') type?: string,
    @Query('parentId') parentId?: string,
    @Query('tags') tags?: string[],
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const params: CapabilitySearchParams = {
      search,
      domain,
      lifecycleStatus,
      type,
      parentId,
      tags,
      page,
      limit,
    };
    return this.capabilityService.findAll(params);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.capabilityService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityManagementRoles)
  async create(@Body() dto: CreateCapabilityDto) {
    return this.capabilityService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityEditRoles)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCapabilityDto) {
    return this.capabilityService.update(id, dto);
  }

  @Get(':id/children')
  async getChildren(@Param('id', ParseUUIDPipe) id: string) {
    return this.capabilityService.getChildren(id);
  }

  @Get(':id/subtree')
  async getSubtree(@Param('id', ParseUUIDPipe) id: string) {
    return this.capabilityService.getSubtree(id);
  }

  @Get(':id/leaves')
  async getLeaves(@Param('id', ParseUUIDPipe) id: string) {
    return this.capabilityService.getLeaves(id);
  }

  @Get(':id/breadcrumbs')
  async getBreadcrumbs(@Param('id', ParseUUIDPipe) id: string) {
    return this.capabilityService.getBreadcrumbs(id);
  }

  @Get(':id/stewardship')
  async getStewardship(@Param('id', ParseUUIDPipe) id: string) {
    return this.capabilityService.getStewardship(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...capabilityManagementRoles)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.capabilityService.delete(id);
  }

  @Get(':id/history')
  async getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.capabilityVersionService.getHistory(id, { page, limit });
  }
}
