import streamDeck from "@elgato/streamdeck";

import { BatteryStatus } from "./actions/battery-status";
import { connectToCUE } from "./corsair";

streamDeck.logger.setLevel("trace");

// Connect to iCUE before the Stream Deck session starts.
connectToCUE(() => {
	streamDeck.logger.info("iCUE session connected");
});

streamDeck.actions.registerAction(new BatteryStatus());

streamDeck.connect();
