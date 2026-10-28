import { Test, TestingModule } from '@nestjs/testing';
import { GlpiService } from './glpi.service';

describe('GlpiService', () => {
  let service: GlpiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlpiService],
    }).compile();

    service = module.get<GlpiService>(GlpiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
