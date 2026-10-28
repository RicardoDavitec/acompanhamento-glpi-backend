import { Test, TestingModule } from '@nestjs/testing';
import { GlpiController } from './glpi.controller';

describe('GlpiController', () => {
  let controller: GlpiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GlpiController],
    }).compile();

    controller = module.get<GlpiController>(GlpiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
