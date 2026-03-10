import { Controller, Get, Query } from '@nestjs/common';
import { NameGuardrailService } from './name-guardrail.service';

@Controller('guardrails')
export class GuardrailController {
  constructor(private readonly nameGuardrailService: NameGuardrailService) {}

  @Get('flagged')
  async findFlaggedCapabilities(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.nameGuardrailService.findFlaggedCapabilities({ page, limit });
  }
}
