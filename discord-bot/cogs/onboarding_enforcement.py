import json
import os
from pathlib import Path

import discord
from discord.ext import commands, tasks

GUILD_ID = 1514974981711462561
WELCOME_FORUM = 1516496171831394437
VERIFICATION_REQUEST_FORUM = 1515796912840773672
INTRODUCTION_FORUM = 1515812572157444187

SEEDLING_ROLE = 1516075786350628955
SAPLING_ROLE = 1516076346025971803
EVERGREEN_ROLE = 1516076523625648279
BLOOMHEARTS_ROLE = 1518175366395596860

DEADLINE_SECONDS = 7 * 24 * 60 * 60
DATA_FILE = Path(__file__).with_name("onboarding_enforcement.json")
INVITE_URL_ENV = "DISCORD_REJOIN_INVITE_URL"
INVITE_CHANNEL_ENV = "DISCORD_REJOIN_INVITE_CHANNEL_ID"
DEFAULT_REJOIN_INVITE_URL = "https://discord.gg/SgFuET8YRd"


class OnboardingEnforcement(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.state = self.load_data()
        self.enforce_onboarding.start()

    def cog_unload(self):
        self.enforce_onboarding.cancel()

    def load_data(self):
        if not DATA_FILE.exists():
            return {"members": {}}

        try:
            with DATA_FILE.open("r") as f:
                data = json.load(f)
        except Exception as error:
            print(f"[ONBOARDING] Could not load {DATA_FILE}: {error}")
            return {"members": {}}

        if not isinstance(data, dict):
            return {"members": {}}

        members = data.setdefault("members", {})
        if not isinstance(members, dict):
            data["members"] = {}

        return data

    def save_data(self):
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp_file = DATA_FILE.with_suffix(f"{DATA_FILE.suffix}.tmp")
        with temp_file.open("w") as f:
            json.dump(self.state, f, indent=4, sort_keys=True)
            f.write("\n")
        os.replace(temp_file, DATA_FILE)

    def member_record(self, member_id):
        members = self.state.setdefault("members", {})
        return members.setdefault(
            str(member_id),
            {
                "seedling_failures": 0,
                "sapling_failures": 0,
                "verification_requested_at": None,
                "intro_posted_at": None,
                "seedling_started_at": None,
                "sapling_started_at": None,
            },
        )

    def has_role(self, member, role_id):
        return any(role.id == role_id for role in member.roles)

    def unix_now(self):
        return int(discord.utils.utcnow().timestamp())

    def unix_timestamp(self, value):
        if value is None:
            return None

        return int(value.timestamp())

    def existing_thread_started_at(self, thread):
        return self.unix_timestamp(getattr(thread, "created_at", None)) or self.unix_now()

    def apply_forum_thread_completion(self, thread):
        if thread.guild is None or thread.owner_id is None:
            return False

        record = self.member_record(thread.owner_id)
        started_at = self.existing_thread_started_at(thread)

        if thread.parent_id == VERIFICATION_REQUEST_FORUM:
            current = record.get("verification_requested_at")
            if current and int(current) <= started_at:
                return False
            record["verification_requested_at"] = started_at
            return True

        if thread.parent_id == INTRODUCTION_FORUM:
            current = record.get("intro_posted_at")
            if current and int(current) <= started_at:
                return False
            record["intro_posted_at"] = started_at
            return True

        return False

    async def sync_forum_completions(self, guild):
        changed = False

        for forum_id in (VERIFICATION_REQUEST_FORUM, INTRODUCTION_FORUM):
            forum = guild.get_channel(forum_id)
            if forum is None or not hasattr(forum, "archived_threads"):
                continue

            for thread in getattr(forum, "threads", []):
                changed = self.apply_forum_thread_completion(thread) or changed

            try:
                async for thread in forum.archived_threads(limit=None):
                    changed = self.apply_forum_thread_completion(thread) or changed
            except Exception as error:
                print(f"[ONBOARDING] Could not sync forum {forum_id}: {error}")

        if changed:
            self.save_data()

    def is_seedling_complete(self, member, record):
        if self.has_role(member, SAPLING_ROLE):
            return True

        if self.has_role(member, EVERGREEN_ROLE):
            return True

        if self.has_role(member, BLOOMHEARTS_ROLE):
            return True

        return bool(record.get("verification_requested_at"))

    def is_sapling_complete(self, member, record):
        if self.has_role(member, EVERGREEN_ROLE):
            return True

        if self.has_role(member, BLOOMHEARTS_ROLE):
            return True

        return bool(record.get("intro_posted_at"))

    def mark_sapling_seen(self, member, record):
        if not self.has_role(member, SAPLING_ROLE):
            return False

        if record.get("sapling_started_at"):
            return False

        record["sapling_started_at"] = self.unix_now()
        return True

    async def resolve_invite_url(self, guild):
        configured_invite = os.getenv(INVITE_URL_ENV)
        if configured_invite:
            return configured_invite

        if DEFAULT_REJOIN_INVITE_URL:
            return DEFAULT_REJOIN_INVITE_URL

        channel_id = os.getenv(INVITE_CHANNEL_ENV)
        channel = None

        if channel_id and channel_id.isdigit():
            channel = guild.get_channel(int(channel_id))

        if channel is None:
            channel = guild.system_channel

        if channel is None:
            channel = guild.get_channel(WELCOME_FORUM)

        if channel is None or not hasattr(channel, "create_invite"):
            return None

        try:
            invite = await channel.create_invite(
                max_age=0,
                max_uses=0,
                unique=False,
                reason="Onboarding timeout rejoin invite",
            )
            return invite.url
        except Exception as error:
            print(f"[ONBOARDING] Could not create invite: {error}")
            return None

    async def dm_member(self, member, message):
        try:
            await member.send(message)
        except Exception as error:
            print(f"[ONBOARDING] Could not DM {member}: {error}")

    def stage_title(self, stage):
        if stage == "verification request":
            return "Verification Request"

        if stage == "introduction":
            return "Introduction"

        return stage.title()

    async def kick_with_invite(self, member, stage):
        invite_url = await self.resolve_invite_url(member.guild)
        invite_text = (
            f"\n\n🌿 **Your rejoin path**\n{invite_url}"
            if invite_url
            else ""
        )
        title = self.stage_title(stage)

        await self.dm_member(
            member,
            (
                f"🌱 **BareUnity onboarding note — {title}**\n\n"
                f"Hey {member.display_name}, your 7-day window for the "
                f"**{stage}** step has passed, so we gently moved you out "
                "of the server for now.\n\n"
                "BareUnity keeps onboarding time-limited so every member "
                "arrives with care, consent, and real community presence."
                f"{invite_text}\n\n"
                "When you rejoin, you get a fresh 7 days to complete this "
                "step. If the same step is missed again after rejoining, "
                "the next action is a ban.\n\n"
                "We hope to see you back when you're ready to continue. 🌳"
            ),
        )

        await member.kick(
            reason=f"Missed {stage} onboarding deadline; first timeout kick"
        )

    async def ban_member(self, member, stage):
        title = self.stage_title(stage)

        await self.dm_member(
            member,
            (
                f"🌳 **BareUnity onboarding closed — {title}**\n\n"
                f"Hey {member.display_name}, this account missed the "
                f"**{stage}** onboarding step again after already receiving "
                "a fresh 7-day rejoin window.\n\n"
                "Because onboarding was not completed after the second "
                "window, access to BareUnity has now been closed with a ban. "
                "Thank you for understanding that we protect the pace, "
                "privacy, and trust of the community. 🌿"
            ),
        )

        await member.ban(
            reason=f"Missed {stage} onboarding deadline after rejoin",
            delete_message_days=0,
        )

    async def handle_timeout(self, member, record, failure_key, stage):
        failures = int(record.get(failure_key, 0))

        if failures <= 0:
            record[failure_key] = failures + 1
            if failure_key == "sapling_failures":
                record["sapling_started_at"] = None
            if failure_key == "seedling_failures":
                record["seedling_started_at"] = None
            self.save_data()
            await self.kick_with_invite(member, stage)
            return

        record[failure_key] = failures + 1
        self.save_data()
        await self.ban_member(member, stage)

    async def enforce_member(self, member):
        if member.bot:
            return

        record = self.member_record(member.id)
        changed = self.mark_sapling_seen(member, record)

        now = self.unix_now()

        if self.has_role(member, SEEDLING_ROLE) and not self.is_seedling_complete(member, record):
            seedling_started_at = record.get("seedling_started_at")
            if not seedling_started_at:
                seedling_started_at = self.unix_timestamp(member.joined_at) or now
                record["seedling_started_at"] = seedling_started_at
                changed = True
            deadline = int(seedling_started_at) + DEADLINE_SECONDS
            if now >= deadline:
                await self.handle_timeout(
                    member,
                    record,
                    "seedling_failures",
                    "verification request",
                )
                return

        if self.has_role(member, SAPLING_ROLE) and not self.is_sapling_complete(member, record):
            sapling_started_at = record.get("sapling_started_at")
            if not sapling_started_at:
                sapling_started_at = now
                record["sapling_started_at"] = sapling_started_at
                changed = True
            deadline = int(sapling_started_at) + DEADLINE_SECONDS

            if now >= deadline:
                await self.handle_timeout(
                    member,
                    record,
                    "sapling_failures",
                    "introduction",
                )
                return

        if changed:
            self.save_data()

    @commands.Cog.listener()
    async def on_member_join(self, member):
        record = self.member_record(member.id)
        record["seedling_started_at"] = self.unix_now()
        if self.has_role(member, SAPLING_ROLE):
            record["sapling_started_at"] = self.unix_now()
        self.save_data()

    @commands.Cog.listener()
    async def on_member_update(self, before, after):
        record = self.member_record(after.id)
        before_sapling = self.has_role(before, SAPLING_ROLE)
        after_sapling = self.has_role(after, SAPLING_ROLE)

        if after_sapling and not before_sapling:
            record["sapling_started_at"] = self.unix_now()
            self.save_data()

    @commands.Cog.listener()
    async def on_thread_create(self, thread):
        if thread.guild is None or thread.owner_id is None:
            return

        if self.apply_forum_thread_completion(thread):
            self.save_data()

    @tasks.loop(minutes=60)
    async def enforce_onboarding(self):
        guild = self.bot.get_guild(GUILD_ID)
        if guild is None:
            return

        await self.sync_forum_completions(guild)

        for member in list(guild.members):
            try:
                await self.enforce_member(member)
            except discord.Forbidden as error:
                print(f"[ONBOARDING] Missing permissions for {member}: {error}")
            except Exception as error:
                print(f"[ONBOARDING] Could not enforce {member}: {error}")

    @enforce_onboarding.before_loop
    async def before_enforce_onboarding(self):
        await self.bot.wait_until_ready()


async def setup(bot):
    await bot.add_cog(OnboardingEnforcement(bot))
