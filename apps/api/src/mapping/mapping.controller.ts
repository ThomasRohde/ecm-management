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
import { mappingManagementRoles } from '../auth/user-role.utils';
import { MappingService } from './mapping.service';
import { CreateMappingDto } from './dto/create-mapping.dto';
import { UpdateMappingDto } from './dto/update-mapping.dto';
import { ListMappingsDto } from './dto/list-mappings.dto';

// ─── Primary mapping controller ───────────────────────────────────────────────

@Controller('mappings')
export class MappingController {
  constructor(private readonly mappingService: MappingService) {}

  // ── List ─────────────────────────────────────────────────────────────────

  @Get()
  async findAll(@Query() query: ListMappingsDto) {
    return this.mappingService.findAll(query);
  }

  // ── By system ─────────────────────────────────────────────────────────────
  //
  // Route must be declared *before* :id so it is not swallowed by the UUID
  // param route (NestJS matches routes in declaration order).

  @Get('by-system/:systemId')
  async findBySystem(@Param('systemId') systemId: string) {
    return this.mappingService.findBySystem(systemId);
  }

  // ── Read one ─────────────────────────────────────────────────────────────

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.mappingService.findOne(id);
  }

  // ── Create ───────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...mappingManagementRoles)
  async create(@Body() dto: CreateMappingDto) {
    return this.mappingService.create(dto);
  }

  // ── Update ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...mappingManagementRoles)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMappingDto) {
    return this.mappingService.update(id, dto);
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedUserGuard, RolesGuard)
  @Roles(...mappingManagementRoles)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.mappingService.delete(id);
  }
}

// ─── Capability-scoped controller ────────────────────────────────────────────
//
// Handles routes nested under /capabilities to avoid a circular dependency
// between CapabilityModule and MappingModule.  Registered in MappingModule.

@Controller('capabilities')
export class CapabilityMappingController {
  constructor(private readonly mappingService: MappingService) {}

  @Get(':capabilityId/mappings')
  async findForCapability(
    @Param('capabilityId', ParseUUIDPipe) capabilityId: string,
  ) {
    return this.mappingService.findByCapability(capabilityId);
  }
}
