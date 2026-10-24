import type {CareerState} from '@/components/live-career';
import type {CareerOutlook} from '@/components/career-outlook';
import type {Badge,Course} from './learning';

export type DemoOutcomes={notice:string;career:CareerState;outlooks:Record<string,CareerOutlook>;improvements:{field:'summary'|'projects';title:string;before:string;after:string;reason:string}[];badge_addition:string;courses:Course[];badges:Badge[]};
