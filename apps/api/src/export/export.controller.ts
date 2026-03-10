import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUserGuard } from '../auth/authenticated-user.guard';
import { GetCapabilityExportDto } from './dto/get-capability-export.dto';
import { ExportService } from './export.service';

@Controller('exports')
@UseGuards(AuthenticatedUserGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * Export the filtered main capability list as CSV.
   *
   * @param query Optional capability filters applied before CSV generation.
   * @returns A downloadable CSV file containing the filtered capabilities.
   */
  @Get('capabilities.csv')
  async exportCapabilitiesCsv(@Query() query: GetCapabilityExportDto): Promise<StreamableFile> {
    const exportFile = await this.exportService.exportCapabilitiesCsv(query);
    const fileBuffer = Buffer.from(exportFile.content, 'utf8');

    return new StreamableFile(fileBuffer, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${exportFile.filename}"`,
      length: fileBuffer.length,
    });
  }

  /**
   * Export the latest published main model as JSON.
   *
   * @returns A JSON export envelope containing the latest published capability model.
   */
  @Get('models/current')
  async exportPublishedModel() {
    return this.exportService.exportPublishedModel();
  }

  /**
   * Export a subtree from the latest published model as JSON.
   *
   * @param capabilityId Root capability identifier for the subtree export.
   * @returns A JSON export envelope containing the published subtree rooted at the capability.
   */
  @Get('models/current/subtree/:id')
  async exportPublishedSubtree(@Param('id', ParseUUIDPipe) capabilityId: string) {
    return this.exportService.exportPublishedSubtree(capabilityId);
  }
}
