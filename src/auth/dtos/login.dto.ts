import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'alex@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Travel123', minLength: 1 })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiProperty({
    example: '/flights/search?origin=CAI&destination=LHR',
    required: false,
    description: 'Optional same-site path to return to after login',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\/(?!\/)[^\\]*$/, {
    message: 'returnTo must be a same-site relative path',
  })
  returnTo?: string;
}
