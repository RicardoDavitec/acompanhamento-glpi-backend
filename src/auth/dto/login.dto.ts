import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'joao.silva', description: 'Usuário de rede do Active Directory' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'senha123', description: 'Senha da rede da prefeitura' })
  @IsString()
  @IsNotEmpty()
  password: string;
}