import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsMongoId, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserRole } from '../../../users/users-role.enum';

export class CreateModeratorDto {
  @ApiProperty({ example: 'Sam Moderator' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'moderator@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'TempPassword123!' , minLength: 8 })
  @IsString()
  @MinLength(8)
  temporaryPassword: string;

  @ApiProperty({ enum: [UserRole.AIRLINE_MODERATOR, UserRole.HOTEL_MODERATOR] })
  @IsEnum([UserRole.AIRLINE_MODERATOR, UserRole.HOTEL_MODERATOR])
  role: UserRole.AIRLINE_MODERATOR | UserRole.HOTEL_MODERATOR;

  @ApiProperty({ required: false, description: 'Required for AIRLINE_MODERATOR' })
  @ValidateIf((dto: CreateModeratorDto) => dto.role === UserRole.AIRLINE_MODERATOR)
  @IsMongoId()
  airlineId?: string;

  @ApiProperty({ required: false, description: 'Required for HOTEL_MODERATOR' })
  @ValidateIf((dto: CreateModeratorDto) => dto.role === UserRole.HOTEL_MODERATOR)
  @IsMongoId()
  hotelId?: string;
}
