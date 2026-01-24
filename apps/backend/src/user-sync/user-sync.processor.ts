import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { UserSyncService, FetchProfileContext } from './user-sync.service';

export interface SyncProfileJobData {
  userId: string;
  context: FetchProfileContext;
}

@Processor('user-sync')
export class UserSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(UserSyncProcessor.name);

  constructor(private readonly userSyncService: UserSyncService) {
    super();
  }

  async process(job: Job<SyncProfileJobData>): Promise<void> {
    const { userId, context } = job.data;

    this.logger.debug(`Processing user sync for ${userId}`);

    const profileData = await this.userSyncService.fetchProfile(userId, context);

    if (!profileData) {
      throw new Error(`Failed to fetch profile for user ${userId}`);
    }

    await this.userSyncService.syncUserProfile(userId, profileData);

    this.logger.log(`User synced: ${userId} (${profileData.displayName})`);
  }
}
