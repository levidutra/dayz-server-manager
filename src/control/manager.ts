import 'reflect-metadata';

import { DiscordBot } from '../services/discord';
import { REST } from '../interface/rest';
import { RCON } from '../services/rcon';
import { Config, Hook, HookType, UserLevel } from '../config/config';
import * as fs from 'fs';
import { SteamCMD } from '../services/steamcmd';
import { Paths } from '../util/paths';
import * as path from 'path';
import { Monitor } from '../services/monitor';
import { Metrics } from '../services/metrics';
import { Interface } from '../interface/interface';
import { Logger, LogLevel } from '../util/logger';
import { Events } from '../services/events';
import { generateConfigTemplate } from '../config/config-template';
import { parseConfigFileContent, validateConfig } from '../config/config-validate';
import { LogReader } from '../services/log-reader';
import { Backups } from '../services/backups';
import { merge } from '../util/merge';
import { Requirements } from '../services/requirements';
import { IngameReport } from '../services/ingame-report';
import { Service } from '../types/service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const configschema = require('../config/config.schema.json');

export class Manager {

    private readonly INGAME_TOKEN: string = `DZSM-${Math.floor(Math.random() * 100000)}-${Math.floor(Math.random() * 100000)}-${Math.floor(Math.random() * 100000)}`;

    private log = new Logger('Manager');

    private paths = new Paths();

    // services
    @Service({ type: Interface, stateful: false })
    public interface!: Interface;

    @Service({ type: REST, stateful: true })
    public rest!: REST;

    @Service({ type: DiscordBot, stateful: true })
    public discord!: DiscordBot;

    @Service({ type: RCON, stateful: true })
    public rcon!: RCON;

    @Service({ type: SteamCMD, stateful: false })
    public steamCmd!: SteamCMD;

    @Service({ type: Monitor, stateful: true })
    public monitor!: Monitor;

    @Service({ type: Metrics, stateful: true })
    public metrics!: Metrics;

    @Service({ type: Events, stateful: true })
    public events!: Events;

    @Service({ type: LogReader, stateful: true })
    public logReader!: LogReader;

    @Service({ type: Backups, stateful: false })
    public backup!: Backups;

    @Service({ type: Requirements, stateful: false })
    public requirements!: Requirements;

    @Service({ type: IngameReport, stateful: false })
    public ingameReport!: IngameReport;

    // config
    public config!: Config;
    public initDone: boolean = false;

    public constructor() {
        this.initDone = false;
    }

    private getConfigFileContent(cfgPath: string): string {
        if (fs.existsSync(cfgPath)) {
            return fs.readFileSync(cfgPath)?.toString();
        }
        throw new Error('Config file does not exist');
    }

    private logConfigErrors(errors: string[]): void {
        this.log.log(LogLevel.ERROR, 'Config has errors:');

        for (const configError of errors) {
            this.log.log(LogLevel.ERROR, configError);
        }
    }

    public readConfig(): boolean {
        try {
            const cfgPath = path.join(this.paths.cwd(), 'server-manager.json');
            this.log.log(LogLevel.IMPORTANT, `Trying to read config at: ${cfgPath}`);
            const fileContent = this.getConfigFileContent(cfgPath);
            const parsed = parseConfigFileContent(fileContent);
            const configErrors = validateConfig(parsed);
            if (configErrors?.length) {
                this.logConfigErrors(configErrors);
                return false;
            }

            this.log.log(LogLevel.IMPORTANT, 'Successfully read config');

            // apply defaults
            this.config = merge(
                new Config(),
                parsed,
            );

            return true;
        } catch (e) {
            this.log.log(LogLevel.ERROR, `Error reading config: ${e.message}`, e);
            return false;
        }
    }

    public writeConfig(config: Config): void {
        // apply defaults
        config = merge(
            new Config(),
            config,
        );

        const configErrors = validateConfig(config);
        if (configErrors?.length) {
            throw ['New config containes errors. Cannot replace config.', ...configErrors];
        }

        try {
            this.writeConfigFile(
                generateConfigTemplate(configschema, config),
            );
        } catch (e) {
            throw [`Error generating / writing config (${e?.message ?? 'Unknown'}). Cannot replace config.`];
        }
    }

    private writeConfigFile(content: string): void {
        const outPath = path.join(this.paths.cwd(), 'server-manager.json');
        fs.writeFileSync(outPath, content);
    }

    public getServerPath(): string {
        const serverFolder = this.config?.serverPath ?? '';
        if (!serverFolder) {
            return path.join(this.paths.cwd(), 'DayZServer');
        }

        if (!path.isAbsolute(serverFolder)) {
            return path.join(this.paths.cwd(), serverFolder);
        }
        return serverFolder;
    }

    public getServerExePath(): string {
        return path.join(this.getServerPath(), (this.config?.serverExe ?? 'DayZServer_x64.exe'));
    }

    public getUserLevel(userId: string): UserLevel {
        return this.config?.admins?.find((x) => x.userId === userId)?.userLevel ?? null;
    }

    public isUserOfLevel(userId: string, level: UserLevel): boolean {
        if (!level) {
            return true;
        }
        const userLevel = this.getUserLevel(userId);
        if (!userLevel) {
            return false;
        }
        const levels: UserLevel[] = ['admin', 'manage', 'moderate', 'view'];
        return levels.includes(userLevel) && levels.indexOf(userLevel) <= levels.indexOf(level);
    }

    public getHooks(type: HookType): Hook[] {
        return (this.config.hooks ?? []).filter((x) => x.type === type);
    }

    public getWebPort(): number {
        if ((this.config?.webPort ?? 0) > 0) {
            return this.config!.webPort;
        }
        return this.config!.serverPort + 11;
    }

    public getIngameToken(): string {
        return this.INGAME_TOKEN;
    }

}
