import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsPhoneNumber,
  Length,
  Matches,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'Currency must be a 3-letter currency code',
  })
  preferredCurrency?: string;
}