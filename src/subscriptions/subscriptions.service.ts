import {
  Inject,
  Injectable,
  NotFoundException,
  Req,
  Request,
  Res,
} from '@nestjs/common';
import Stripe from 'stripe';
import { UserService } from 'src/user/user.service';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;

  constructor(
    @Inject('STRIPE_API_KEY') private readonly apiKey: string,
    private readonly userService: UserService,
  ) {
    this.stripe = new Stripe(this.apiKey, {
      apiVersion: '2024-04-10',
    });
  }

  async cancelSubscription(userId: string) {
    const userDB = await this.userService.findOne(userId);

    if (!userDB.subscriptionId) {
      throw new NotFoundException('Usuario no tiene suscripción');
    }
    const subscription = await this.getSubscription(userDB.subscriptionId);
    if (!subscription) {
      throw new NotFoundException('Suscripción no encontrada');
    }
    await this.userService.setSubscription(
      null,
      userDB.customerId,
      userDB.email,
      null,
    );
    await this.stripe.subscriptions.cancel(userDB.subscriptionId);
  }

  async getPlans(): Promise<any[]> {
    const plans = await this.stripe.plans.list();
    const formatSubscriptions = plans.data.map((plan) => {
      return {
        price: Number.parseFloat((plan.amount / 100).toFixed(2)),
        name: `${plan.amount / 100}.00 ${plan.currency}/${plan.interval} `,
        currency: plan.currency,
        price_cents: plan.amount,
        interval: plan.interval,
        id: plan.id,
      };
    });
    const filteredPlans = formatSubscriptions.filter((plan) =>
      plan.price.toString().includes('5'),
    );
    return filteredPlans;
  }

  async checkoutSubscription(planId: string, userId: string) {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new Error('Usuário no encontrado');
    }

    const plan = await this.getPlan(planId);

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }
    let customer = user.customerId;
    if (!user.customerId) {
      customer = await this.stripe.customers
        .create({
          email: user.email,
        })
        .then((customer) => customer.id);
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customer,
      line_items: [
        {
          quantity: 1,
          price: planId,
        },
      ],
      success_url: 'https://rindoor-2-0.vercel.app/subscription',
      cancel_url: 'https://rindoor-2-0.vercel.app/subscription',
    });

    const sessionUrl = { url: session.url };

    return sessionUrl;
  }

  async getPlan(planId: string) {
    const plan = await this.stripe.plans.retrieve(planId);
    return plan;
  }

  async getAllSubscriptions() {
    const findSubscriptions = await this.stripe.subscriptions.list({
      status: 'all',
    });
    const subscriptions = await Promise.all(
      findSubscriptions.data.map(async (s) => {
        const customer = await this.stripe.customers.retrieve(
          s.customer as string,
        );

        const userDB = await this.userService.findByCustomerIdStripe(
          s.customer as string,
        );

        if (!userDB) {
          return null;
        }

        const userToReturn = {
          name: userDB.name,
          email: userDB.email,
          id: userDB.id,
          phone: userDB.phone,
          role: userDB.role,
        };

        const planItems = s.items.data.map((item) => ({
          interval: item.plan.interval,
          currency: item.plan.currency,
          price: item.plan.interval === 'month' ? '5' : '50',
        }));

        return {
          id: s.id,
          createdAt: new Date(s.created * 1000),
          current_period_end: new Date(s.current_period_end * 1000),
          current_period_start: new Date(s.current_period_start * 1000),
          status: s.status,
          plan: planItems,
          user: userToReturn,
        };
      }),
    );
    const filteredSubscriptions = subscriptions.filter((s) => s !== null);

    return filteredSubscriptions;
  }

  async getSubscription(subscriptionId: string) {
    const subscriptions = await this.stripe.subscriptions.list({
      status: 'all',
    });
    const subscription = subscriptions.data.find((sub) => {
      return sub.id === subscriptionId;
    });
    if (!subscription) {
      throw new NotFoundException('Suscripción no encontrada');
    }
    const subscriptionToSend = {
      id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000)
        .toISOString()
        .split('T')[0],
      current_period_start: new Date(subscription.current_period_start * 1000)
        .toISOString()
        .split('T')[0],
      status: subscription.status,
      latest_invoice: subscription.latest_invoice,
      customer: subscription.customer,
    };
    return subscriptionToSend;
  }

  async getUserSubscriptions(userId: string) {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const userSubscriptions = this.stripe.subscriptions.list({
      customer: user.customerId,
      status: 'all',
    });
    const userSubsMapped = (await userSubscriptions).data.map((sub) => {
      return {
        id: sub.id,
        current_period_end: new Date(sub.current_period_end * 1000)
          .toISOString()
          .split('T')[0],
        current_period_start: new Date(sub.current_period_start * 1000)
          .toISOString()
          .split('T')[0],
        status: sub.status,
        latest_invoice: sub.latest_invoice,
        customer: sub.customer,
      };
    });

    return userSubsMapped;
  }

  async verifyPayment(
    subscriptionId: string,
    customerId: string,
    emailUser: string,
    planId: string,
  ) {
    this.userService.setSubscription(
      subscriptionId,
      customerId,
      emailUser,
      planId,
    );
  }
}
