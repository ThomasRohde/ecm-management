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
import type { AuthTokenPayload } from '../auth/auth.types';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { mappingManagementRoles } from '../auth/user-role.utils';
import { CreateDownstreamConsumerDto } from './dto/create-downstream-consumer.dto';
import { ListDownstreamConsumerEventsDto } from './dto/list-downstream-consumer-events.dto';
import { ListDownstreamConsumersDto } from './dto/list-downstream-consumers.dto';
import { UpdateDownstreamConsumerDto } from './dto/update-downstream-consumer.dto';
import { DownstreamConsumerService } from './downstream-consumer.service';

@Controller('downstream-consumers')
@UseGuards(AuthenticatedUserGuard, RolesGuard)
@Roles(...mappingManagementRoles)
export class DownstreamConsumerController {
  constructor(
    private readonly downstreamConsumerService: DownstreamConsumerService,
  ) {}

  @Get()
  list(@Query() query: ListDownstreamConsumersDto) {
    return this.downstreamConsumerService.list(query);
  }

  @Get('health')
  getHealthSummary() {
    return this.downstreamConsumerService.getHealthSummary();
  }

  @Get('events')
  listEventLog(@Query() query: ListDownstreamConsumerEventsDto) {
    return this.downstreamConsumerService.listEventLog(query);
  }

  @Get('transformation-profiles')
  listTransformationProfiles() {
    return this.downstreamConsumerService.listTransformationProfiles();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.downstreamConsumerService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateDownstreamConsumerDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.downstreamConsumerService.create(dto, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDownstreamConsumerDto,
    @CurrentUser() user: AuthTokenPayload,
  ) {
    return this.downstreamConsumerService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<void> {
    await this.downstreamConsumerService.delete(id, user.sub);
  }
}
