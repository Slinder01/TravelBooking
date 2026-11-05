import {
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one digit',
  })
  temporaryPassword: string;
}