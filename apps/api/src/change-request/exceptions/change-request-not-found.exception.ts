import { NotFoundException } from '@nestjs/common';

export class ChangeRequestNotFoundException extends NotFoundException {
  constructor(id: string) {
    super(`Change request with ID "${id}" not found`);
  }
}
