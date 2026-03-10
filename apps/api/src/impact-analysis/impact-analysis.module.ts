import { Module } from '@nestjs/common';
import { ImpactAnalysisService } from './impact-analysis.service';
import { ImpactAnalysisController } from './impact-analysis.controller';

@Module({
  controllers: [ImpactAnalysisController],
  providers: [ImpactAnalysisService],
  exports: [ImpactAnalysisService],
})
export class ImpactAnalysisModule {}
