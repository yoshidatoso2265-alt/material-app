import { materialsRepository } from './materials.repository';
import { createError } from '../../middleware/errorHandler';
import { MaterialFilter, MaterialListItem } from '../../types/material';
import { PaginatedResult } from '../../types/common';

class MaterialsService {
  getAll(filter: MaterialFilter): PaginatedResult<MaterialListItem> {
    return materialsRepository.findAll(filter);
  }

  getById(id: number): MaterialListItem {
    const item = materialsRepository.findById(id);
    if (!item) throw createError('材料レコードが見つかりません', 404);
    return item;
  }
}

export const materialsService = new MaterialsService();
