import { IsOptional, IsString } from 'class-validator';

export class CommentBodyDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
