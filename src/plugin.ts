import streamDeck from "@elgato/streamdeck";

import { FixText } from "./actions/fix-text";
import { GatherActive, GatherAway, GatherBusy } from "./actions/gather-status";
import { NextDeploy } from "./actions/next-deploy";
import { NotifErrors } from "./actions/notif-errors";
import { ReviewCount } from "./actions/review-count";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel("trace");

// Register the script actions.
streamDeck.actions.registerAction(new FixText());
streamDeck.actions.registerAction(new GatherActive());
streamDeck.actions.registerAction(new GatherBusy());
streamDeck.actions.registerAction(new GatherAway());
streamDeck.actions.registerAction(new NextDeploy());
streamDeck.actions.registerAction(new NotifErrors());
streamDeck.actions.registerAction(new ReviewCount());

// Finally, connect to the Stream Deck.
streamDeck.connect();
