import * as qs from 'qs';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ShelterSearchPropsSchema } from 'src/shelter/types/search.types';
import { SearchSchema } from 'src/types';
import { parseTagResponse, ShelterSearch } from 'src/shelter/ShelterSearch';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { SupplyPriority } from 'src/supply/types';

@Injectable()
export class DashboardService {
  constructor(private readonly prismaService: PrismaService) {}

  async index(query: any) {
    const {
      order,
      orderBy,
      page,
      perPage,
      search: searchQuery,
    } = SearchSchema.parse(query);
    const queryData = ShelterSearchPropsSchema.parse(qs.parse(searchQuery));
    const { getQuery } = new ShelterSearch(this.prismaService, queryData);
    const where = await getQuery();

    const count = await this.prismaService.shelter.count({ where });

    const take = perPage;
    const skip = perPage * (page - 1);

    const whereData: Prisma.ShelterFindManyArgs<DefaultArgs> = {
      take,
      skip,
      orderBy: { [orderBy]: order },
      where,
    };

    //Shelters
    const allShelters = await this.prismaService.shelter.findMany({
      ...whereData,
      select: {
        id: true,
        name: true,
        shelteredPeople: true,
        actived: true,
        capacity: true,
        shelterSupplies: {
          select: {
            priority: true, 
            supply: {
              select: {
                supplyCategory: {
                  select: {
                    name: true 
                  }
                }
              }
            }
          }
        }
      }
    });

    const categoriesWithPriorities = await this.prismaService.supplyCategory.findMany({
      select: {
        id: true,
        name: true,
        supplies: {
          select: {
            shelterSupplies: {
              select: {
                priority: true,
                shelterId: true
              }
            }
          }
        }
      }
    });
    
    // Mapeia as categorias e conta as prioridades para cada abrigo
    const result = categoriesWithPriorities.map(category => {
      const priorityCounts = {
        priority100: 0,
        priority10: 0,
        priority1: 0
      };
    
      // Cria um conjunto para evitar a contagem duplicada de abrigos
      const countedShelters = new Set();
    
      // Para cada abrigo associado à categoria
      category.supplies.forEach(supply => {
        supply.shelterSupplies.forEach(shelterSupply => {
          if (!countedShelters.has(shelterSupply.shelterId)) {
            switch (shelterSupply.priority) {
              case 100:
                priorityCounts.priority100++;
                break;
              case 10:
                priorityCounts.priority10++;
                break;
              case 1:
                priorityCounts.priority1++;
                break;
              default:
                break;
            }
            // Adiciona o abrigo ao conjunto para evitar a contagem duplicada
            countedShelters.add(shelterSupply.shelterId);
          }
        });
      });
    
      return {
        categoryId: category.id,
        categoryName: category.name,
        ...priorityCounts
      };
    });

    const allPeopleSheltered = allShelters.reduce((accumulator, current) => {
      if (current.actived && current.capacity !== null && current.capacity > 0) {

        return accumulator + (current.shelteredPeople ?? 0);
      } else {

        return accumulator;
      }
    }, 0);
    

    return {
      allShelters: allShelters.length,
      categoriesWithPriorities: result,
      allPeopleSheltered: allPeopleSheltered,
    };
  }
}