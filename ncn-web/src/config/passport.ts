import passport from 'passport';
import LdapStrategy from 'passport-ldapauth';
import { config } from '.';
import { logger } from '../utils/logger';
import { IUser } from '../types';

interface LdapUser {
  sAMAccountName: string;
  uid?: string;
  displayName?: string;
  cn?: string;
  mail?: string;
  department?: string;
  title?: string;
}

export const setupLdapStrategy = () => {
  passport.use(new LdapStrategy(
    {
      server: {
        url: config.ldap.url,
        bindDN: config.ldap.bindDN,
        bindCredentials: config.ldap.bindCredentials,
        searchBase: config.ldap.baseDN,
        searchFilter: config.ldap.searchFilter,
        searchAttributes: ['sAMAccountName', 'displayName', 'mail', 'department', 'title'],
        tlsOptions: { rejectUnauthorized: false }
      },
      usernameField: 'username',
      passwordField: 'password'
    },
    (user: LdapUser, done: (err: any, user?: IUser | false) => void) => {
      try {
        // Transform LDAP user object to application user format
        const applicationUser: IUser = {
          lanId: user.sAMAccountName || user.uid || '',
          displayName: user.displayName || user.cn || '',
          email: user.mail || '',
          department: user.department || '',
          title: user.title || ''
        };

        logger.info(`User authenticated: ${applicationUser.lanId}`);
        return done(null, applicationUser);
      } catch (error) {
        logger.error('LDAP auth error:', error);
        return done(error, false);
      }
    }
  ));

  passport.serializeUser((user: any, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: any, done) => {
    done(null, user);
  });
};
