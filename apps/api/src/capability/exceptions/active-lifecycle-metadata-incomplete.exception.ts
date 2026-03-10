import { BadRequestException } from '@nestjs/common';

export class ActiveLifecycleMetadataIncompleteException extends BadRequestException {
  constructor(missingFields: string[]) {
    super(
      `Active lifecycle status requires the following fields to be populated: ${missingFields.join(
        ', ',
      )}`,
    );
  }
}
