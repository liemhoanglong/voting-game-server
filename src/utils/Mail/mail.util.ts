import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import { IUser } from 'User/interfaces/user.interface';
import { ITeam } from 'Team/interfaces/team.interface';
import * as path from 'path';
import * as hbs from 'nodemailer-express-handlebars';

export class MailUtil {
    private readonly transporter: Mail;

    constructor() {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });

      this.transporter.use('compile', hbs({
        viewEngine: {
          extname: '.hbs',
          partialsDir: path.join(__dirname, './views'),
          layoutsDir: path.join(__dirname, './views/layouts'),
          defaultLayout: 'blank',
        },
        viewPath: path.join(__dirname, './views'),
        extName: '.hbs',
      }));
    }

    async sendVerificationMail(user:IUser, token: string): Promise<void> {
      const email = {
        from: `"Lumin Planning Poker" <${process.env.EMAIL}>`,
        to: user.email,
        subject: 'Verification Email',
        template: 'verification',
        context: {
          title: 'Email Verification',
          name: user.name,
          activationLink: `${process.env.CLIENT_DOMAIN}/activate/${token}`,
        },
      };

      try {
        await this.transporter.sendMail(email);
      } catch (error) {
        console.log(error);
      }
    }

    async sendResetPasswordMail(user:IUser, token: string): Promise<void> {
      const email = {
        from: `"Lumin Planning Poker" <${process.env.EMAIL}>`,
        to: user.email,
        subject: 'Reset Password Email',
        template: 'resetPassword',
        context: {
          title: 'Reset Your Password',
          name: user.name,
          activationLink: `${process.env.CLIENT_DOMAIN}/reset-password/${token}`,
        },
      };

      try {
        await this.transporter.sendMail(email);
      } catch (error) {
        console.log(error);
      }
    }

    private createNameAvatar(name: string): string {
      const nameSplit = name.split(' ');
      if (nameSplit.length === 1) { return nameSplit[0].charAt(0).toUpperCase(); }
      return nameSplit[0].charAt(0).toUpperCase() + nameSplit[nameSplit.length - 1].charAt(0).toUpperCase();
    }

    async sendTeamInvitationMail(admin:IUser, member:IUser, team: ITeam, teamLink: string): Promise<void> {
      const email = {
        from: `"${admin.name}" <${process.env.EMAIL}>`,
        to: member.email,
        subject: `${admin.name} invited you to ${team.name} team`,
        template: 'teamInvitation',
        context: {
          title: 'Team Invitation',
          admin: {
            name: admin.name,
            avatar: null,
          },
          adminNameAvatar: this.createNameAvatar(admin.name),
          member: {
            name: member.name,
            avatar: null,
          },
          memberNameAvatar: this.createNameAvatar(member.name),
          teamLink: `${process.env.CLIENT_DOMAIN}/${teamLink}`,
          teamName: team.name,
        },
      };

      try {
        await this.transporter.sendMail(email);
      } catch (error) {
        console.log(error);
      }
    }
}
