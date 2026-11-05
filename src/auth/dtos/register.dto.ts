import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Alex Morgan', description: 'Full name of the user' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'alex@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Travel123', minLength: 8, description: 'At least 8 characters, including a letter and a digit' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one digit',
  })
  password: string;

  @ApiProperty({ example: true, description: 'Acceptance of terms and privacy policy' })
  @IsBoolean()
  termsAccepted: boolean;
}
