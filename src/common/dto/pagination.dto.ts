import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
export class PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset = 0;
}
